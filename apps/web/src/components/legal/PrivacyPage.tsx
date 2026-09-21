import { LegalShell } from "@/components/layout/LegalShell";

const sections = [
  {
    title: "Information We Collect",
    body: `When you sign in with GitHub, we receive your GitHub username, email address, name, and avatar URL. We store this to identify your account and display it in the dashboard. We also collect installation data: which repositories you have authorized Merg to review.`,
  },
  {
    title: "Code Access",
    body: `To generate pull request reviews, Merg temporarily reads the diff of each pull request from GitHub via the GitHub API. We do not store your source code. Diff content is processed in memory, passed to the AI agents, and discarded after the review job completes.`,
  },
  {
    title: "Review Data",
    body: `We store review session metadata (PR number, review status, comment count, timestamps) associated with your account. This data is used to power the Merg dashboard. You can delete your account and all associated data at any time from Settings.`,
  },
  {
    title: "Third-Party Services",
    body: `Merg uses the GitHub API to read diffs and post review comments. AI agents may use third-party model APIs (e.g., Google Gemini). Diff excerpts may be sent to these providers solely for the purpose of generating review content. We do not sell your data to third parties.`,
  },
  {
    title: "Data Security",
    body: `We use HTTPS for all data in transit. Secrets (GitHub App private keys, JWT secrets) are stored as environment variables and never committed to source control. JWT tokens expire and are not stored server-side beyond session validation.`,
  },
  {
    title: "Cookies and Session",
    body: `We use a single httpOnly session cookie, issued after a GitHub OAuth login, to keep you signed in to the dashboard. We do not use tracking cookies or analytics cookies.`,
  },
  {
    title: "Data Retention",
    body: `Account data is retained until you delete your account. Review session metadata is retained for up to 90 days and then purged. If you uninstall the GitHub App, your installation data is removed within 30 days.`,
  },
  {
    title: "Your Rights",
    body: `You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at privacy@merg.xyz. We will respond within 30 days.`,
  },
  {
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a notice in the dashboard. Continued use of the Service after notification constitutes acceptance.`,
  },
  {
    title: "Contact",
    body: `For privacy-related questions, contact us at privacy@merg.xyz.`,
  },
];

export function PrivacyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" updatedAt="July 2026">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#20201e] dark:text-white">{s.title}</h2>
          <p className="mt-3 text-[14px] leading-7 text-[#55554f] dark:text-[#a1a1aa]">{s.body}</p>
        </section>
      ))}
    </LegalShell>
  );
}