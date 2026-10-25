import type { Ride } from "./types";
export function rideRecord(r: Record<string, unknown>): Ride {
  return {
    id: String(r.id),
    driverId: String(r.driver_id),
    driverName: String(r.driver_name),
    origin: String(r.origin),
    campus: String(r.campus),
    destination: String(r.destination),
    departure: String(r.departure),
    seats: Number(r.seats),
    priceCents: Number(r.price_cents),
    car: String(r.car),
    notes: String(r.notes),
    status: String(r.status),
    createdAt: String(r.created_at),
    accepted: Number(r.accepted),
  };
}
