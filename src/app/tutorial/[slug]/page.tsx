import TutorialClient from "./TutorialClient";

/* ---- Static params for `output: "export"` ---- */
export function generateStaticParams() {
  /* Add new slugs here when adding tutorial pages */
  return [
    { slug: "einfuehrung-lua01" },
  ];
}

export default function TutorialPage() {
  return <TutorialClient />;
}

