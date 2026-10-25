import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your health vault, or the vault someone has shared with you." footer={<>New to Allele? <Link className="text-helix underline" href="/signup">Create your vault</Link></>}>
      <LoginForm />
    </AuthCard>
  );
}
