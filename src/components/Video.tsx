import { mediaUrl } from "../api";

/** Turns a YouTube or Vimeo watch link into an embeddable URL. Returns null for anything else. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?playsinline=1&rel=0`;
    if (host === "youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v"))
        return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}?playsinline=1&rel=0`;
      const m = u.pathname.match(/^\/(shorts|embed)\/([\w-]+)/);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[2]}?playsinline=1&rel=0`;
    }
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
  } catch {
    /* not a URL */
  }
  return null;
}

export function hasVideo(e: { video_key: string | null; video_url: string | null }) {
  return !!(e.video_key || e.video_url);
}

export function Video({ videoKey, videoUrl, autoPlay, title }: { videoKey: string | null; videoUrl: string | null; autoPlay?: boolean; title?: string }) {
  if (videoKey)
    return (
      <div className="video">
        <video src={mediaUrl(videoKey)} controls playsInline loop autoPlay={autoPlay} muted={autoPlay} preload="metadata" />
      </div>
    );
  if (!videoUrl) return null;
  const embed = embedUrl(videoUrl);
  if (embed)
    return (
      <div className="video">
        <iframe src={embed} title="Exercise demo" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(videoUrl))
    return (
      <div className="video">
        <video src={videoUrl} controls playsInline loop preload="metadata" />
      </div>
    );
  // Links we can't embed (e.g. a YouTube search) open in a new tab from a video-style tile.
  return (
    <a className="video video-link" href={videoUrl} target="_blank" rel="noreferrer">
      <span className="play"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
      <span className="video-caption">{title ? `Watch ${title}` : "Watch demo"}</span>
    </a>
  );
}
