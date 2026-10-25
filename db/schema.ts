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
    campus: text("campus").notNull().default(""),
    destination: text("destination").notNull(),
    departure: text("departure").notNull(),
    seats: integer("seats").notNull(),
    priceCents: integer("price_cents").notNull(),
    car: text("car").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("rides_departure_idx").on(t.departure),
    index("rides_discovery_idx").on(t.status, t.departure, t.id),
    index("rides_price_idx").on(t.status, t.priceCents, t.departure, t.id),
  ],
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
  (t) => [
    uniqueIndex("one_booking_per_rider").on(t.rideId, t.riderId),
    index("bookings_capacity_idx").on(t.rideId, t.status),
  ],
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

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  campus: text("campus").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id")
      .notNull()
      .references(() => rides.id),
    reporterId: text("reporter_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    moderatorId: text("moderator_id"),
    resolutionNotes: text("resolution_notes"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    uniqueIndex("one_report_per_user_ride").on(t.rideId, t.reporterId),
    index("reports_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});
