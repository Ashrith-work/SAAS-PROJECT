// Back-compat shim. The canonical plan config now lives in lib/razorpay-plans.ts
// (HotelTrack bills in INR via Razorpay). Existing imports of "@/lib/plans"
// (getPlan, hotelLimit, isActiveStatus, PLANS, PLAN_ORDER, …) keep working
// through this re-export.
export * from "./razorpay-plans";
