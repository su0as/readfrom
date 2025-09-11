import { storeGet } from '@/utils/blobStore';

export const dynamic = 'force-dynamic';

// Next.js 15 PageProps defines `params` as a Promise for dynamic routes
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const specRaw = await storeGet(`rf:spec:${id}`);
  if (!specRaw) return (<div style={{ padding: 16, fontFamily: 'sans-serif' }}>Not found</div>);
  const spec = JSON.parse(specRaw) as { container: 'mp3' | 'ogg' };
  const url = `/api/export/download?id=${encodeURIComponent(id)}&container=${spec.container || 'mp3'}`;
  return (
    <html lang="en"><body style={{ margin: 0 }}>
      <audio controls preload="none" style={{ width: '100%' }} src={url} />
    </body></html>
  );
}

