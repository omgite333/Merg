import { LegalShell } from "@/components/layout/LegalShell";

const sections = [
  {
    title: "Acceptance of Terms",
    body: `By accessing or using Merg ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. Merg Labs reserves the right to update these terms at any time. Continued use of the Service after changes constitutes acceptance of the updated terms.`,
  },
  {
    title: "Description of Service",
    body: `Merg provides an AI-powered pull request review service that integrates with GitHub via a GitHub App. The Service analyzes code changes and posts automated review comments on pull requests.`,
  },
  {
    title: "GitHub Integration",
    body: `To use Merg, you must authorize the Merg GitHub App on your repositories. You grant Merg read access to your code for the purpose of generating automated reviews. Merg does not store your source code beyond what is required to process individual review jobs.`,
  },
  {
    title: "Acceptable Use",
    body: `You agree not to use the Service to review code that contains malware, to attempt to reverse-engineer or bypass rate limits, or to resell or redistribute the Service without written permission. Abuse of the Service may result in immediate account termination.`,
  },
  {
    title: "Disclaimer of Warranties",
    body: `The Service is provided "as is" without warranties of any kind. Merg does not guarantee that automated reviews will catch all bugs, security vulnerabilities, or performance issues. AI-generated review comments may contain errors. You are responsible for all code that ships to production.`,
  },
  {
    title: "Limitation of Liability",
    body: `To the maximum extent permitted by law, Merg Labs shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the preceding twelve months.`,
  },
  {
    title: "Termination",
    body: `You may terminate your account at any time by uninstalling the GitHub App and deleting your account. We may suspend or terminate accounts that violate these terms. On termination, your review history will be deleted within 30 days.`,
  },
  {
    title: "Governing Law",
    body: `These terms are governed by the laws of the State of Delaware, United States. Any disputes shall be resolved in the courts of Delaware.`,
  },
  {
    title: "Contact",
    body: `For questions about these terms, contact us at legal@merg.xyz.`,
  },
];

export function TermsPage() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" updatedAt="July 2026">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#20201e] dark:text-white">{s.title}</h2>
          <p className="mt-3 text-[14px] leading-7 text-[#55554f] dark:text-[#a1a1aa]">{s.body}</p>
        </section>
      ))}
    </LegalShell>
  );
}