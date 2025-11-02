'use server'

import { getCurrentUser } from "@/lib/auth";
import pool from "@/lib/db";
import { Profile, Resume, WorkExperience, Education, Skill, Project, Job } from "@/lib/types";
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { simplifiedJobSchema, simplifiedResumeSchema } from "@/lib/zod-schemas";

// Helper function to check if we're in development bypass mode
function isDevelopmentBypass(): boolean {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
}


interface DashboardData {
  profile: Profile | null;
  baseResumes: Resume[];
  tailoredResumes: Resume[];
}

export async function getDashboardData(): Promise<DashboardData> {
  // Development bypass - skip authentication
  if (isDevelopmentBypass()) {
    return getMockDashboardData();
  }

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;


  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    const user = session?.user!
    
    // Fetch profile data
    let profile;
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    profile = data;

    // If profile doesn't exist, create one
    if (profileError?.code === 'PGRST116') {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          first_name: null,
          last_name: null,
          email: user.email,
          phone_number: null,
          location: null,
          website: null,
          linkedin_url: null,
          github_url: null,
          work_experience: [],
          education: [],
          skills: [],
          projects: [],
          certifications: []
        }])
        .select()
        .single();

      if (createError) {
        console.error('Error creating profile:', createError);
        throw new Error('Error creating user profile');
      }

      profile = newProfile;
    } else if (profileError) {
      console.error('Error fetching profile:', profileError);
      throw new Error('Error fetching dashboard data');
    }

    // Fetch resumes data
    const { data: resumes, error: resumesError } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user.id);

    if (resumesError) {
      console.error('Error fetching resumes:', resumesError);
      throw new Error('Error fetching dashboard data');
    }

    const baseResumes = resumes?.filter(resume => resume.is_base_resume) ?? [];
    const tailoredResumes = resumes?.filter(resume => !resume.is_base_resume) ?? [];

    const baseResumesData = baseResumes.map(resume => ({
      ...resume,
      type: 'base' as const
    }));

    const tailoredResumesData = tailoredResumes.map(resume => ({
      ...resume,
      type: 'tailored' as const
    }));

    return {
      profile,
      baseResumes: baseResumesData,
      tailoredResumes: tailoredResumesData
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'User not authenticated') {
      return {
        profile: null,
        baseResumes: [],
        tailoredResumes: []
      };
    }
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
    
    // If not found, create a mock one for the purpose of the bypass
    const newMockResume: Resume = {
      id: resumeId,
      user_id: 'dev-user-123',
      name: 'Mock Tailored Resume',
      target_role: 'Mock Role',
      is_base_resume: false,
      first_name: 'John',
      last_name: 'Developer',
      email: 'john.dev@example.com',
      phone_number: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
      website: 'https://johndeveloper.com',
      linkedin_url: 'https://linkedin.com/in/johndeveloper',
      github_url: 'https://github.com/johndeveloper',
      work_experience: mockDashboardData.profile!.work_experience,
      education: mockDashboardData.profile!.education,
      skills: mockDashboardData.profile!.skills,
      projects: mockDashboardData.profile!.projects,
      certifications: mockDashboardData.profile!.certifications,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_cover_letter: false,
      section_order: ['work_experience', 'education', 'skills', 'projects', 'certifications']
    };
    
    return {
      resume: newMockResume,
      profile: mockDashboardData.profile!
    };
  }

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error } = await supabase.auth.getSession()
  const user = session?.user

  // If no user, return null
  if (!user) {
    console.warn('getResumeById called without authenticated user.');
    return null;
  }

  try {
    const [resumeResult, profileResult] = await Promise.all([
      supabase
        .from('resumes')
        .select('*')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
    ]);

    if (resumeResult.error || !resumeResult.data) {
      throw new Error('Resume not found');
    }

    if (profileResult.error || !profileResult.data) {
      throw new Error('Profile not found');
    }

    return { 
      resume: resumeResult.data, 
      profile: profileResult.data 
    };
  } catch (error) {
    throw error;
  }
}

export async function updateResume(resumeId: string, data: Partial<Resume>): Promise<Resume> {
  // Development bypass
  if (isDevelopmentBypass()) {
    console.log('Resume update bypassed in development mode:', resumeId);
    const mockResume: Resume = {
      id: resumeId,
      user_id: 'dev-user-123',
      name: data.name || 'Mock Resume',
      target_role: data.target_role || 'Developer',
      is_base_resume: data.is_base_resume ?? true,
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
      updated_at: new Date().toISOString(),
      has_cover_letter: data.has_cover_letter ?? false,
      section_order: data.section_order || ['work_experience', 'education', 'skills', 'projects', 'certifications']
    };
    return mockResume;
  }

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user!

  const { data: resume, error } = await supabase
    .from('resumes')
    .update(data)
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to update resume');
  }

  return resume;
}

export async function importResume(data: Partial<Profile>): Promise<Profile> {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user!
  
  // First, get the current profile
  const { data: currentProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (fetchError) {
    void fetchError
    throw new Error(`Failed to fetch current profile: ${fetchError.message}`);
  }

  // Prepare the update data
  const updateData: Partial<Profile> = {};

  // Handle simple string fields - only update if current value is null/empty
  const simpleFields = ['first_name', 'last_name', 'email', 'phone_number', 
    'location', 'website', 'linkedin_url', 'github_url'] as const;
  
  simpleFields.forEach((field) => {
    if (data[field] !== undefined) {
      // Only update if current value is null or empty string
      if (!currentProfile[field]) {
        updateData[field] = data[field];
      }
    }
  });

  // Handle array fields - append to existing arrays
  const arrayFields = ['work_experience', 'education', 'skills', 
    'projects', 'certifications'] as const;
  
  arrayFields.forEach((field) => {
    if (data[field]?.length) {
      // Simply append new items to the existing array
      updateData[field] = [
        ...(currentProfile[field] || []),
        ...data[field]
      ];
    }
  });

  // Only proceed with update if there are changes
  if (Object.keys(updateData).length === 0) {
    return currentProfile;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  // Revalidate all routes that might display profile data
  revalidatePath('/', 'layout');
  revalidatePath('/profile/edit', 'layout');
  revalidatePath('/resumes', 'layout');
  revalidatePath('/profile', 'layout');

  return profile;
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

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!

  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  // Revalidate all routes that might display profile data
  revalidatePath('/', 'layout');
  revalidatePath('/profile/edit', 'layout');
  revalidatePath('/resumes', 'layout');
  revalidatePath('/profile', 'layout');

  return profile;
}

export async function resetProfile(): Promise<Profile> {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!  


  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const emptyProfile: Partial<Profile> = {
    first_name: null,
    last_name: null,
    email: null,
    phone_number: null,
    location: null,
    website: null,
    linkedin_url: null,
    github_url: null,
    work_experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: []
  };

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(emptyProfile)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to reset profile');
  }

  return profile;
}

export async function deleteResume(resumeId: string): Promise<void> {
  // Development bypass
  if (isDevelopmentBypass()) {
    console.log('Resume delete bypassed in development mode:', resumeId);
    return;
  }

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error } = await supabase.auth.getSession()
  const user = session?.user!

  try {
    // First verify the resume exists and belongs to the user
    // Also fetch job_id and is_base_resume to check if it's a tailored resume
    const { data: resume, error: fetchError } = await supabase
      .from('resumes')
      .select('id, name, job_id, is_base_resume')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !resume) {
      throw new Error('Resume not found or access denied');
    }

    // If it's a tailored resume with a job_id, delete the associated job first
    if (!resume.is_base_resume && resume.job_id) {
      const { error: jobDeleteError } = await supabase
        .from('jobs')
        .delete()
        .eq('id', resume.job_id)
        .eq('user_id', user.id);

      if (jobDeleteError) {
        console.error('Failed to delete associated job:', jobDeleteError);
        // Continue with resume deletion even if job deletion fails
      }
    }

    // Then delete the resume
    const { error: deleteError } = await supabase
      .from('resumes')
      .delete()
      .eq('id', resumeId)
      .eq('user_id', user.id);

    if (deleteError) {
      throw new Error('Failed to delete resume');
    }

    // Revalidate all routes that might display resumes or jobs
    revalidatePath('/', 'layout');
    revalidatePath('/resumes', 'layout');
    revalidatePath('/dashboard', 'layout');
    revalidatePath('/resumes/base', 'layout');
    revalidatePath('/resumes/tailored', 'layout');
    revalidatePath('/jobs', 'layout'); // Add jobs path revalidation

  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to delete resume');
  }
}

export async function createBaseResume(
  name: string, 
  importOption: 'import-profile' | 'fresh' | 'import-resume' = 'import-profile',
  selectedContent?: {
    // Basic Info
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    location?: string;
    website?: string;
    linkedin_url?: string;
    github_url?: string;
    
    // Content Sections
    work_experience: WorkExperience[];
    education: Education[];
    skills: Skill[];
    projects: Project[];
  }
): Promise<Resume> {
  // Development bypass
  if (isDevelopmentBypass()) {
    const mockResume: Resume = {
      id: 'mock-resume-' + Date.now(),
      user_id: 'dev-user-123',
      name,
      target_role: name,
      is_base_resume: true,
      first_name: selectedContent?.first_name || 'John',
      last_name: selectedContent?.last_name || 'Developer',
      email: selectedContent?.email || 'john.dev@example.com',
      phone_number: selectedContent?.phone_number || '+1 (555) 123-4567',
      location: selectedContent?.location || 'San Francisco, CA',
      website: selectedContent?.website || 'https://johndeveloper.com',
      linkedin_url: selectedContent?.linkedin_url || 'https://linkedin.com/in/johndeveloper',
      github_url: selectedContent?.github_url || 'https://github.com/johndeveloper',
      work_experience: selectedContent?.work_experience || [],
      education: selectedContent?.education || [],
      skills: selectedContent?.skills || [],
      projects: selectedContent?.projects || [],
      certifications: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_cover_letter: false,
      section_order: ['work_experience', 'education', 'skills', 'projects', 'certifications']
    };
    console.log('Mock resume created in development mode:', mockResume.id);
    return mockResume;
  }

  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error } = await supabase.auth.getSession()
  const user = session?.user!
  // Get user's profile for initial data if not starting fresh
  let profile = null;
  if (importOption !== 'fresh') {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }
    profile = data;
  }

  const resumeContent = {
    // Use selectedContent basic info for import-resume, otherwise use profile data
    first_name: importOption === 'import-resume' ? selectedContent?.first_name || '' : importOption === 'fresh' ? '' : profile?.first_name || '',
    last_name: importOption === 'import-resume' ? selectedContent?.last_name || '' : importOption === 'fresh' ? '' : profile?.last_name || '',
    email: importOption === 'import-resume' ? selectedContent?.email || '' : importOption === 'fresh' ? '' : profile?.email || '',
    phone_number: importOption === 'import-resume' ? selectedContent?.phone_number || '' : importOption === 'fresh' ? '' : profile?.phone_number || '',
    location: importOption === 'import-resume' ? selectedContent?.location || '' : importOption === 'fresh' ? '' : profile?.location || '',
    website: importOption === 'import-resume' ? selectedContent?.website || '' : importOption === 'fresh' ? '' : profile?.website || '',
    linkedin_url: importOption === 'import-resume' ? selectedContent?.linkedin_url || '' : importOption === 'fresh' ? '' : profile?.linkedin_url || '',
    github_url: importOption === 'import-resume' ? selectedContent?.github_url || '' : importOption === 'fresh' ? '' : profile?.github_url || '',
    // For import-profile or import-resume, use the selected content. For fresh, use empty arrays
    work_experience: (importOption === 'import-profile' || importOption === 'import-resume') && selectedContent 
      ? selectedContent.work_experience
      : [],
    education: (importOption === 'import-profile' || importOption === 'import-resume') && selectedContent
      ? selectedContent.education
      : [],
    skills: (importOption === 'import-profile' || importOption === 'import-resume') && selectedContent
      ? selectedContent.skills
      : [],
    projects: (importOption === 'import-profile' || importOption === 'import-resume') && selectedContent
      ? selectedContent.projects
      : [],
    certifications: [],
    section_order: [
      'work_experience',
      'education',
      'skills',
      'projects',
      'certifications'
    ],
    section_configs: {
      work_experience: { visible: (selectedContent?.work_experience?.length ?? 0) > 0 },
      education: { visible: (selectedContent?.education?.length ?? 0) > 0 },
      skills: { visible: (selectedContent?.skills?.length ?? 0) > 0 },
      projects: { visible: (selectedContent?.projects?.length ?? 0) > 0 },
      certifications: { visible: false }
    }
  };

  const newResume = {
    user_id: user.id,
    title: name,
    is_base_resume: true,
    content: resumeContent
  };

  const { data: resume, error: createError } = await supabase
    .from('resumes')
    .insert(newResume)
    .select()
    .single();

  if (createError) {
    console.error('\nDatabase Insert Error:', {
      code: createError.code,
      message: createError.message,
      details: createError.details,
      hint: createError.hint
    });
    throw new Error(`Failed to create resume: ${createError.message}`);
  }

  if (!resume) {
    console.error('\nNo resume data returned after insert');
    throw new Error('Resume creation failed: No data returned');
  }

  return resume;
}

export async function createTailoredResume(
  baseResume: Resume,
  jobId: string,
  jobTitle: string,
  companyName: string,
  tailoredContent: z.infer<typeof simplifiedResumeSchema>
) {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!

  // Combine base resume settings with tailored content
  const newResume = {
    ...tailoredContent,
    user_id: user.id,
    job_id: jobId,
    is_base_resume: false,
    // Copy all contact information from base resume
    first_name: baseResume.first_name,
    last_name: baseResume.last_name,
    email: baseResume.email,
    phone_number: baseResume.phone_number,
    location: baseResume.location,
    website: baseResume.website,
    linkedin_url: baseResume.linkedin_url,
    github_url: baseResume.github_url,
    // Preserve document settings and section configurations from base resume
    document_settings: baseResume.document_settings,
    section_configs: baseResume.section_configs,
    section_order: baseResume.section_order,
    // Add metadata
    resume_title: `${jobTitle} at ${companyName}`,
    name: `${jobTitle} at ${companyName}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('resumes')
    .insert([newResume])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createJob(jobListing: z.infer<typeof simplifiedJobSchema>) {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!

  const jobData = {
    user_id: user.id,
    company_name: jobListing.company_name,
    position_title: jobListing.position_title,
    job_url: jobListing.job_url,
    description: jobListing.description,
    location: jobListing.location,
    salary_range: jobListing.salary_range,
    keywords: jobListing.keywords,
    work_location: jobListing.work_location || 'in_person', 
    employment_type: jobListing.employment_type || 'full_time', 
    is_active: true
  };

  const { data, error } = await supabase
    .from('jobs')
    .insert([jobData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteJob(jobId: string): Promise<void> {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!


  // First, get all resumes that reference this job
  const { data: affectedResumes } = await supabase
    .from('resumes')
    .select('id')
    .eq('job_id', jobId);

  // Delete the job
  const { error: deleteError } = await supabase
    .from('jobs')
    .delete()
    .eq('id', jobId);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    throw new Error('Failed to delete job');
  }

  // Revalidate all affected resume paths
  affectedResumes?.forEach(resume => {
    revalidatePath(`/resumes/${resume.id}`);
  });
  
  // Also revalidate the general paths
  revalidatePath('/', 'layout');
  revalidatePath('/resumes', 'layout');
}

interface JobListingParams {
  page: number;
  pageSize: number;
  filters?: {
    workLocation?: 'remote' | 'in_person' | 'hybrid';
    employmentType?: 'full_time' | 'part_time' | 'co_op' | 'internship';
    keywords?: string[];
  };
}

export async function getJobListings({ 
  page = 1, 
  pageSize = 10, 
  filters 
}: JobListingParams) {
  const supabase = await createClient();

  // Calculate offset
  const offset = (page - 1) * pageSize;

  // Start building the query
  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Apply filters if they exist
  if (filters) {
    if (filters.workLocation) {
      query = query.eq('work_location', filters.workLocation);
    }
    if (filters.employmentType) {
      query = query.eq('employment_type', filters.employmentType);
    }
    if (filters.keywords && filters.keywords.length > 0) {
      query = query.contains('keywords', filters.keywords);
    }
  }

  // Add pagination
  const { data: jobs, error, count } = await query
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Error fetching jobs:', error);
    throw new Error('Failed to fetch job listings');
  }

  return {
    jobs,
    totalCount: count ?? 0,
    currentPage: page,
    totalPages: Math.ceil((count ?? 0) / pageSize)
  };
}

export async function deleteTailoredJob(jobId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('jobs')
    .update({ is_active: false })
    .eq('id', jobId);

  if (error) {
    throw new Error('Failed to delete job');
  }

  revalidatePath('/', 'layout');
}

export async function createEmptyJob(): Promise<Job> {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!

  const emptyJob: Partial<Job> = {
    user_id: user.id,
    company_name: 'New Company',
    position_title: 'New Position',
    job_url: null,
    description: null,
    location: null,
    salary_range: null,
    keywords: [],
    work_location: null,
    employment_type: null,
    is_active: true
  };

  const { data, error } = await supabase
    .from('jobs')
    .insert([emptyJob])
    .select()
    .single();

  if (error) {
    console.error('Error creating job:', error);
    throw new Error('Failed to create job');
  }

  revalidatePath('/', 'layout');
  return data;
}

export async function copyResume(resumeId: string): Promise<Resume> {
  const supabase = await createClient();
  const client = supabase.auth as any;
  client.suppressGetSessionWarning = true;

  const { data: { session }, error: userError } = await supabase.auth.getSession()
  const user = session?.user!


  const { data: sourceResume, error: fetchError } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !sourceResume) {
    throw new Error('Resume not found or access denied');
  }

  // Create a new resume with copied data, excluding the id field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, ...resumeDataToCopy } = sourceResume;
  
  const newResume = {
    ...resumeDataToCopy,
    name: `${sourceResume.name} (Copy)`,
    user_id: user.id,
  };

  const { data: copiedResume, error: createError } = await supabase
    .from('resumes')
    .insert([newResume])
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to copy resume: ${createError.message}`);
  }

  if (!copiedResume) {
    throw new Error('Resume creation failed: No data returned');
  }

  // Revalidate all routes that might display resumes
  revalidatePath('/', 'layout');
  revalidatePath('/resumes', 'layout');
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/resumes/base', 'layout');
  revalidatePath('/resumes/tailored', 'layout');

  return copiedResume;
}

export async function getSubscriptionStatus() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select(`
      subscription_plan,
      subscription_status,
      current_period_end,
      trial_end,
      stripe_customer_id,
      stripe_subscription_id
    `)
    .eq('user_id', user.id)
    .single();

  if (subscriptionError) {
    // If no subscription found, return a default free plan instead of throwing
    void subscriptionError
    if (subscriptionError.code === 'PGRST116') {
      return {
        subscription_plan: 'Free',
        subscription_status: 'active',
        current_period_end: null,
        trial_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null
      };
    }
    throw new Error('Failed to fetch subscription status');
  }

  return subscription;
}

export async function createCheckoutSession(priceId: string) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceId,
      userId: user.id,
      email: user.email,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }

  const { sessionId } = await response.json();
  return { sessionId };
}

export async function cancelSubscription() {
  // Development bypass
  if (isDevelopmentBypass()) {
    console.log('Subscription cancellation bypassed in development mode');
    throw new Error('Subscription management not available in development mode');
  }

  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const response = await fetch('/api/cancel-subscription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: user.id,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to cancel subscription');
  }

  // Update the profile subscription status
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      subscription_status: 'canceled',
    })
    .eq('id', user.id);

  if (updateError) {
    throw new Error('Failed to update subscription status');
  }

  revalidatePath('/', 'layout');
  revalidatePath('/settings', 'layout');
  revalidatePath('/plans', 'layout');
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
        },
        {
          company: 'Digital Solutions LLC',
          position: 'Full Stack Developer',
          location: 'Remote',
          date: '2020 - 2022',
          description: [
            'Built responsive web applications for enterprise clients',
            'Optimized database queries improving performance by 40%',
            'Collaborated with design team to implement pixel-perfect UIs'
          ],
          technologies: ['Vue.js', 'Python', 'PostgreSQL', 'Redis']
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
        },
        {
          category: 'Frontend Frameworks',
          items: ['React', 'Vue.js', 'Next.js', 'Svelte']
        },
        {
          category: 'Databases',
          items: ['PostgreSQL', 'MongoDB', 'Redis', 'MySQL']
        },
        {
          category: 'Cloud & DevOps',
          items: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform']
        }
      ],
      projects: [
        {
          name: 'AI-Powered Resume Builder',
          description: [
            'Built a full-stack application using Next.js and Supabase',
            'Integrated OpenAI API for intelligent content generation',
            'Implemented user authentication and real-time collaboration'
          ],
          date: '2024',
          technologies: ['Next.js', 'TypeScript', 'Supabase', 'OpenAI API'],
          url: 'https://resume-builder.com',
          github_url: 'https://github.com/johndeveloper/resume-builder'
        },
        {
          name: 'E-commerce Platform',
          description: [
            'Developed scalable e-commerce solution with microservices architecture',
            'Implemented payment processing with Stripe integration',
            'Built admin dashboard with real-time analytics'
          ],
          date: '2023',
          technologies: ['React', 'Node.js', 'MongoDB', 'Stripe API'],
          github_url: 'https://github.com/johndeveloper/ecommerce-platform'
        }
      ],
      certifications: [
        {
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          date_acquired: '2023-06-15',
          credential_id: 'AWS-SA-2023-123456'
        }
      ],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    baseResumes: [
      {
        id: 'resume-base-1',
        user_id: 'dev-user-123',
        name: 'Software Developer Resume',
        target_role: 'Full Stack Developer',
        is_base_resume: true,
        first_name: 'John',
        last_name: 'Developer',
        email: 'john.dev@example.com',
        phone_number: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        website: 'https://johndeveloper.com',
        linkedin_url: 'https://linkedin.com/in/johndeveloper',
        github_url: 'https://github.com/johndeveloper',
        work_experience: [],
        education: [],
        skills: [],
        projects: [],
        certifications: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        has_cover_letter: false,
        section_order: ['work_experience', 'education', 'skills', 'projects', 'certifications']
      }
    ],
    tailoredResumes: []
  };
}

