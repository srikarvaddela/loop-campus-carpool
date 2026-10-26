import { z } from "zod";
const location = z
  .string()
  .trim()
  .min(2, "Add a location with at least 2 characters.")
  .max(100);
export const postRideSchema = z
  .object({
    origin: location,
    destination: location,
    departure: z
      .string()
      .datetime({ offset: true })
      .refine(
        (v) => Date.parse(v) > Date.now(),
        "Departure must be in the future.",
      ),
    seats: z.number().int().min(1).max(8),
    priceCents: z.number().int().min(0).max(50000),
    car: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(600).default(""),
  })
  .refine((v) => v.origin.toLowerCase() !== v.destination.toLowerCase(), {
    message: "Choose a different destination.",
    path: ["destination"],
  });
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("post"), ride: postRideSchema }),
  z.object({
    action: z.literal("edit"),
    expectedVersion: z.number().int().min(1),
    rideId: z.string().min(1).max(100),
    ride: postRideSchema,
  }),
  z.object({
    action: z.literal("request"),
    rideId: z.string().min(1),
    expectedVersion: z.number().int().min(1),
  }),
  z.object({ action: z.literal("accept"), bookingId: z.string().min(1) }),
  z.object({ action: z.literal("decline"), bookingId: z.string().min(1) }),
  z.object({
    action: z.literal("cancelBooking"),
    bookingId: z.string().min(1),
  }),
  z.object({ action: z.literal("cancelRide"), rideId: z.string().min(1) }),
]);
