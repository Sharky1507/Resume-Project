// Test file to verify environment variables are working
console.log('Environment Variables Test:');
console.log('NODE_VERSION:', process.version);
console.log('NEXT_PUBLIC_DEV_BYPASS_AUTH:', process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH);
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'Present' : 'Missing');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing');

// Test the development bypass function
function isDevelopmentBypass() {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
}

console.log('isDevelopmentBypass():', isDevelopmentBypass());

if (isDevelopmentBypass()) {
  console.log('✅ Development bypass is active');
} else {
  console.log('❌ Development bypass is NOT active');
}