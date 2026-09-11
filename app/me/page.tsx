import type { Metadata } from "next";
import HereContent from "../here/HereContent";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Lea 🖤",
  description: "brave nachbarstochter aus friedrichshain. manche geheimnisse teil ich nur privat.",
  openGraph: {
    title: "Lea 🖤",
    description: "brave nachbarstochter aus friedrichshain. manche geheimnisse teil ich nur privat.",
    url: "https://leaberlin.com/me",
    images: ["/here/hero.jpg"],
    type: "website",
    locale: "de_DE",
  },
};

// Account: @lea__fhain (double underscore)
export default function Me() {
  return (
    <HereContent
      handle="@lea__fhain"
      instagram="https://www.instagram.com/lea__fhain/"
      threads="https://www.threads.com/@lea__fhain"
    />
  );
}
