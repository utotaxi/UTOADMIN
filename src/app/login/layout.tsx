import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login — UTO Admin Panel",
  description: "Sign in to access the UTO Admin Panel.",
};

/**
 * Login layout — no sidebar, just a centered login form.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
