/* eslint-disable @next/next/no-img-element -- avatars come from Firebase Storage URLs */

interface AvatarProps {
  url: string | null | undefined;
  name: string | null | undefined;
  fallback?: string;
  /** Size, shape and extra styling. */
  className?: string;
  colorClassName?: string;
}

export function Avatar({
  url,
  name,
  fallback = "?",
  className = "w-10 h-10 rounded-full",
  colorClassName = "bg-primary text-primary-foreground",
}: AvatarProps) {
  return (
    <div
      className={`overflow-hidden flex items-center justify-center font-bold shrink-0 ${colorClassName} ${className}`}
    >
      {url ? (
        <img src={url} alt={name ? `${name}'s photo` : "Profile photo"} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden>{(name?.trim()?.[0] || fallback).toUpperCase()}</span>
      )}
    </div>
  );
}
