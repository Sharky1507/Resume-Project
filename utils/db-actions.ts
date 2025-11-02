'use server'

import pool from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Profile, Resume, Job } from '@/lib/types';
import { revalidatePath } from 'next/cache';

interface DashboardData {
  profile: Profile | null;
  baseResumes: Resume[];
  tailoredResumes: Resume[];
}

// Helper function to check if we're in development bypass mode
function isDevelopmentBypass(): boolean {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
}

export async function getDashboardData(): Promise<DashboardData> {
  // Development bypass - skip authentication
  if (isDevelopmentBypass()) {
    return getMockDashboardData();
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      profile: null,
      baseResumes: [],
      tailoredResumes: []
    };
  }

  try {
    // Fetch profile data
    const profileResult = await pool.query(
      'SELECT * FROM public.profiles WHERE id = $1',
      [user.id]
    );
    
    let profile = profileResult.rows[0] || null;

    // If profile doesn't exist, create one
    if (!profile) {
      const newProfileResult = await pool.query(`
        INSERT INTO public.profiles (id, email, work_experience, education, skills, projects, certifications)
        VALUES ($1, $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
        RETURNING *
      `, [user.id, user.email]);
      
      profile = newProfileResult.rows[0];
    }

    // Fetch resumes data
    const resumesResult = await pool.query(
      'SELECT * FROM public.resumes WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    );

    const resumes = resumesResult.rows;
    const baseResumes = resumes.filter(resume => resume.is_base_resume);
    const tailoredResumes = resumes.filter(resume => !resume.is_base_resume);

    return {
      profile,
      baseResumes,
      tailoredResumes
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error;
  }
}

export async function getResumeById(resumeId: string): Promise<{ resume: Resume; profile: Profile } | null> {
  // Development bypass
  if (isDevelopmentBypass()) {
    const mockDashboardData = getMockDashboardData();
    const allResumes = [...mockDashboardData.baseResumes, ...mockDashboardData.tailoredResumes];
    const resume = allResumes.find(r => r.id === resumeId);
    
    if (resume) {
      return {
        resume,
        profile: mockDashboardData.profile!
      };
    }
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  try {
    const [resumeResult, profileResult] = await Promise.all([
      pool.query('SELECT * FROM public.resumes WHERE id = $1 AND user_id = $2', [resumeId, user.id]),
      pool.query('SELECT * FROM public.profiles WHERE id = $1', [user.id])
    ]);

    if (resumeResult.rows.length === 0 || profileResult.rows.length === 0) {
      return null;
    }

    return { 
      resume: resumeResult.rows[0], 
      profile: profileResult.rows[0] 
    };
  } catch (error) {
    console.error('Error fetching resume:', error);
    throw error;
  }
}

export async function createBaseResume(
  name: string, 
  importOption: 'import-profile' | 'fresh' | 'import-resume' = 'import-profile',
  selectedContent?: any
): Promise<Resume> {
  // Development bypass
  if (isDevelopmentBypass()) {
    const mockResume: Resume = {
      id: 'mock-resume-' + Date.now(),
      user_id: 'dev-user-123',
      title: name,
      is_base_resume: true,
      content: selectedContent || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_cover_letter: false,
    };
    console.log('Mock resume created in development mode:', mockResume.id);
    return mockResume;
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get user's profile for initial data if not starting fresh
  let profile = null;
  if (importOption !== 'fresh') {
    const profileResult = await pool.query('SELECT * FROM public.profiles WHERE id = $1', [user.id]);
    profile = profileResult.rows[0] || null;
  }

  const resumeContent = selectedContent || {};

  const result = await pool.query(`
    INSERT INTO public.resumes (user_id, title, is_base_resume, content)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [user.id, name, true, JSON.stringify(resumeContent)]);

  if (result.rows.length === 0) {
    throw new Error('Failed to create resume');
  }

  revalidatePath('/');
  return result.rows[0];
}

export async function updateProfile(data: Partial<Profile>): Promise<Profile> {
  // Development bypass
  if (isDevelopmentBypass()) {
    console.log('Profile update bypassed in development mode');
    const mockProfile: Profile = {
      id: 'dev-user-123',
      first_name: data.first_name || 'John',
      last_name: data.last_name || 'Developer',
      email: data.email || 'john.dev@example.com',
      phone_number: data.phone_number || '+1 (555) 123-4567',
      location: data.location || 'San Francisco, CA',
      website: data.website || 'https://johndeveloper.com',
      linkedin_url: data.linkedin_url || 'https://linkedin.com/in/johndeveloper',
      github_url: data.github_url || 'https://github.com/johndeveloper',
      work_experience: data.work_experience || [],
      education: data.education || [],
      skills: data.skills || [],
      projects: data.projects || [],
      certifications: data.certifications || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return mockProfile;
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
      updateFields.push(`${key} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  });

  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(user.id);
  const query = `
    UPDATE public.profiles 
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query(query, values);

  if (result.rows.length === 0) {
    throw new Error('Failed to update profile');
  }

  revalidatePath('/');
  return result.rows[0];
}

// Development bypass - mock data for testing
function getMockDashboardData(): DashboardData {
  return {
    profile: {
      id: 'dev-user-123',
      first_name: 'John',
      last_name: 'Developer',
      email: 'john.dev@example.com',
      phone_number: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
      website: 'https://johndeveloper.com',
      linkedin_url: 'https://linkedin.com/in/johndeveloper',
      github_url: 'https://github.com/johndeveloper',
      work_experience: [
        {
          company: 'Tech Startup Inc.',
          position: 'Senior Software Developer',
          location: 'San Francisco, CA',
          date: '2022 - Present',
          description: [
            'Led development of scalable web applications using React and Node.js',
            'Implemented CI/CD pipelines reducing deployment time by 60%',
            'Mentored junior developers and conducted code reviews'
          ],
          technologies: ['React', 'Node.js', 'TypeScript', 'AWS', 'Docker']
        }
      ],
      education: [
        {
          school: 'University of California, Berkeley',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          location: 'Berkeley, CA',
          date: '2016 - 2020',
          gpa: 3.8,
          achievements: ['Dean\'s List', 'CS Honor Society']
        }
      ],
      skills: [
        {
          category: 'Programming Languages',
          items: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go']
        }
      ],
      projects: [
        {
          name: 'AI-Powered Resume Builder',
          description: [
            'Built a full-stack application using Next.js and PostgreSQL',
            'Integrated AI for intelligent content generation'
          ],
          date: '2024',
          technologies: ['Next.js', 'TypeScript', 'PostgreSQL', 'AI'],
          url: 'https://resume-builder.com',
          github_url: 'https://github.com/johndeveloper/resume-builder'
        }
      ],
      certifications: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    baseResumes: [],
    tailoredResumes: []
  };
}