import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Familien",
    short_name: "Familien",
    description: "Familiens kalender, oppgaver og handleliste",
    lang: "nb",
    // Appen åpner på «I dag»-oversikten.
    start_url: "/i-dag",
    display: "standalone",
    background_color: "#fff8ef",
    theme_color: "#fff8ef",
    // «Del til Familien» fra delingsmenyen (Android/PC når appen er installert). iPhone: se README (snarvei).
    share_target: {
      action: "/api/del",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "filer",
            accept: [
              "image/*",
              "application/pdf",
              "text/plain",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ".docx",
            ],
          },
        ],
      },
    },
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
