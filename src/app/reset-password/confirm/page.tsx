import { ResetPasswordConfirmForm } from "./confirm-form";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {token ? (
        <ResetPasswordConfirmForm token={token} />
      ) : (
        <p className="mt-4 text-sm text-red-600">This reset link is missing a token. Request a new one.</p>
      )}
    </div>
  );
}
