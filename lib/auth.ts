import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '@/lib/db';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function createUser(email: string, password: string): Promise<User> {
  const hashedPassword = await hashPassword(password);
  
  const result = await pool.query(
    'INSERT INTO auth.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at, updated_at',
    [email, hashedPassword]
  );
  
  const user = result.rows[0];
  
  // Create corresponding profile
  await pool.query(
    'INSERT INTO public.profiles (id, email) VALUES ($1, $2)',
    [user.id, email]
  );
  
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const result = await pool.query(
    'SELECT * FROM auth.users WHERE email = $1',
    [email]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const user = result.rows[0];
  const isValid = await verifyPassword(password, user.password_hash);
  
  if (!isValid) {
    return null;
  }
  
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  
  if (!token) {
    return null;
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }
  
  const result = await pool.query(
    'SELECT id, email, created_at, updated_at FROM auth.users WHERE id = $1',
    [payload.userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
}