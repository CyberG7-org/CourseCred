import { AuthScreen } from "@/components/auth-form";

export const metadata = { title: "Sign in — CourseCred" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
