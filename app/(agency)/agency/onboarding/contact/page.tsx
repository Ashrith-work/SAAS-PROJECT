import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { AgencyContactForm } from "@/components/agency/AgencyContactForm";
import { saveAgencyContactSignup } from "./actions";

// Required signup step ("Tell us how hotels can reach you"). Lives OUTSIDE the
// (app) group so it isn't subscription-gated. The (app) layout bounces any
// post-deploy agency without contact info here until it's filled in; this page
// itself sends anyone who's already provided it straight to the dashboard.
export default async function ContactInfoStep() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");
  if (member.agency.mobile != null) redirect("/agency/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-line p-6">
        <div>
          <h1 className="text-xl font-semibold">Tell us how hotels can reach you</h1>
          <p className="mt-1 text-sm text-ink-tertiary">
            These details will be shown to hotel owners on their dashboard so they can
            contact you quickly.
          </p>
        </div>
        <AgencyContactForm
          action={saveAgencyContactSignup}
          submitLabel="Continue to Dashboard"
          footerNote="You can edit these anytime in Agency Settings."
        />
      </div>
    </main>
  );
}
