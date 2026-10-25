import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export const rides = sqliteTable(
  "rides",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id").notNull(),
    driverName: text("driver_name").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departure: text("departure").notNull(),
    seats: integer("seats").notNull(),
    priceCents: integer("price_cents").notNull(),
    car: text("car").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("rides_departure_idx").on(t.departure)],
);
export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => rides.id),
    riderId: text("rider_id").notNull(),
    riderName: text("rider_name").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("one_booking_per_rider").on(t.rideId, t.riderId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    senderId: text("sender_id").notNull(),
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("messages_booking_created_idx").on(t.bookingId, t.createdAt)],
);
