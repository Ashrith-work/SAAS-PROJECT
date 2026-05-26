import Link from "next/link";
import { HotelForm } from "./HotelForm";

export default function NewHotelPage() {
  return (
    <div className="max-w-xl">
      <Link href="/agency/hotels" className="text-sm text-zinc-500 hover:underline">
        ← Hotel Clients
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Add Hotel Client
      </h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">
        We&apos;ll generate a unique tracking snippet for this hotel after you
        save.
      </p>
      <HotelForm />
    </div>
  );
}
