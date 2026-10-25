import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create your vault" };

export default function SignupPage() {
  return (
    <AuthCard title="Create your health vault" subtitle="Your vault is private to you. You choose what goes in and who else can see it." footer={<>Already have a vault? <Link className="text-helix underline" href="/login">Sign in</Link></>}>
      <SignupForm />
    </AuthCard>
  );
}
