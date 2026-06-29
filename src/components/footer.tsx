export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted">
        © {new Date().getFullYear()} CourseCred — AI-graded exams &amp; verifiable
        certificates.
      </div>
    </footer>
  );
}
