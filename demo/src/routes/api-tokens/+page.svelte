<script lang="ts">
  import ApiTokenManagement from '@bridge-svelte/lib/client/components/developer/ApiTokenManagement.svelte';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  const doc = getDoc('api-tokens');
  const usage = section(doc, 'ApiTokenManagement');
  const server = section(doc, 'Using a token from a server');
  const hood = section(doc, 'Under the hood');

  const codeTabs = [
    usage?.code[0] && { label: 'Usage', code: usage.code[0].code, lang: 'svelte' },
    server?.code[0] && { label: 'Server', code: server.code[0].code, lang: 'ts' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Team Management', href: '/team-panel' },
    { label: 'Workspaces', href: '/workspaces' },
  ];
</script>

<FeaturePage
  title="API tokens"
  breadcrumb="Team & tenancy / API tokens"
  oneLiner={doc?.frontmatter.oneLiner ?? ''}
  introHtml={doc?.introHtml ?? ''}
  {codeTabs}
  underTheHoodHtml={hood?.html ?? ''}
  {related}
>
  {#snippet live()}
    <!-- Real SDK component — list / create (scoped) / show-once / revoke. -->
    <ApiTokenManagement />
  {/snippet}
</FeaturePage>
