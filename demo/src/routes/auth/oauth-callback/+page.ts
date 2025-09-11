// export const ssr = false;
// import { redirect } from '@sveltejs/kit';
// import { auth } from '@nblocks-svelte/lib/shared/services/auth.service';
// import type { PageLoad } from './$types';
// import { logger } from '@nblocks-svelte/lib/shared/logger';

// export const load: PageLoad = async ({ url }) => {
//   const { handleCallback } = auth;
//   const code = url.searchParams.get('code');

//   if (code) {
//     try {
//       await handleCallback(code);
//     } catch (err) {      
//       logger.error('Auth callback error:', err);
//     }
//   }

//   // Redirect the user to the home page after the callback is handled
//   throw redirect(303, '/');
// };