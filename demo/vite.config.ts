import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	server: {
		host: '0.0.0.0',        // <== required for container access
		port: 3001,             // <== optional: fixed port
		strictPort: true,       // <== optional: fail if port is in use
		watch: {
		  usePolling: true      // <== optional: fixes HMR issues in some containers
		}
	  }
});
