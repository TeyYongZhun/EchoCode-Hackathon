/**
 * The demo video in the hero. `src` is either a YouTube link (or bare id), which
 * is embedded through youtube-nocookie.com, or a path to an .mp4 served from
 * `public/`. Set it in page.tsx; until it has a value the animated code mock
 * stands in, so the page is never broken while the video is being made.
 */
export function HeroVideo({ src, poster }: { src: string; poster?: string }) {
  const youTubeId = youTubeIdFrom(src);

  return (
    <div className="hero-video">
      {youTubeId ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youTubeId}?rel=0&modestbranding=1`}
          title="EchoCode demo"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <video controls preload="metadata" playsInline poster={poster}>
          <source src={src} type="video/mp4" />
          Your browser can&apos;t play this video.{' '}
          <a href={src}>Download it instead.</a>
        </video>
      )}
    </div>
  );
}

/** The 11-character id in any usual YouTube link, or the id on its own. */
function youTubeIdFrom(src: string): string | undefined {
  const link = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(src);
  if (link) return link[1];
  return /^[\w-]{11}$/.test(src.trim()) ? src.trim() : undefined;
}
