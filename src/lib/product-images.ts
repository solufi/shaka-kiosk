export function localProductPhoto(imageId: string): string {
  return `/api/product-images/${encodeURIComponent(imageId)}`;
}
