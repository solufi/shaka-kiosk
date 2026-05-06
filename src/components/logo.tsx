import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex items-center h-full">
      <Image
        src="/Shaka_Transparent.png"
        alt="Shaka Logo"
        width={568}
        height={160}
        priority
        className="object-contain h-full w-auto"
      />
    </div>
  );
}
