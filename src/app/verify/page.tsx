import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VerifyForm } from "@/components/verify-form";

export const metadata = { title: "Verify a certificate — CourseCred" };

export default function VerifyPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h1 className="text-3xl font-bold text-brand-dark">
            Verify a certificate
          </h1>
          <p className="mt-2 text-muted">
            Enter the verification code from a certificate or its QR code.
          </p>
          <div className="mt-8">
            <VerifyForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
