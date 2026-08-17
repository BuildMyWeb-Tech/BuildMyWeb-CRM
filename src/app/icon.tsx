import { ImageResponse } from "next/og";

// BuildMyWeb brand mark favicon — two overlapping chevrons forming
// the "B", approximated from the supplied logo exports (colors
// sampled directly from Logo_in_Bg-Black.jpg: #ADBADA / #7191E6).
// No background box: both colors read fine on light and dark
// browser chrome, so this stays theme-agnostic. Matches the same
// BrandMark shape used in src/components/layout/sidebar.tsx.
//
// This route takes precedence over src/app/favicon.ico, which is
// the Next.js default and can stay on disk harmlessly (or be
// removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="20" height="32" viewBox="0 0 164 262" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0L130 66L36 132V90L74 66L0 24V0Z" fill="#ADBADA" />
          <path d="M0 90L130 156L36 222V180L74 156L0 114V90Z" fill="#7191E6" />
        </svg>
      </div>
    ),
    { ...size },
  );
}