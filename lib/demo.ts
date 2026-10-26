import type { Snapshot, Message, Report } from "./types";
export function demoSnapshot(): Snapshot {
  const departure = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const now = new Date().toISOString();
  const entries = [
    [
      "demo-1",
      "maya",
      "Maya Chen",
      "Campus · Student Union",
      "Chicago · O’Hare Airport",
      1,
      9,
      3,
      1800,
      "Toyota Corolla",
      "One suitcase per person fits comfortably. Meet by the main entrance.",
    ],
    [
      "demo-2",
      "james",
      "James Wilson",
      "Campus · North Library",
      "Madison · Downtown",
      1,
      14,
      2,
      1500,
      "Honda Civic",
      "Heading home for the weekend. Happy to make one quick coffee stop.",
    ],
    [
      "demo-3",
      "sofia",
      "Sofia Patel",
      "Campus · Student Union",
      "Milwaukee · City Center",
      2,
      10,
      3,
      1200,
      "Subaru Outback",
      "Plenty of trunk space. Please be at the pickup point five minutes early.",
    ],
    [
      "demo-4",
      "alex",
      "Alex Rivera",
      "Campus · West Residence",
      "Chicago · Downtown",
      2,
      16,
      2,
      2000,
      "Hyundai Elantra",
      "Easygoing ride into the city. Small bags welcome.",
    ],
    [
      "demo-5",
      "nora",
      "Nora Thompson",
      "Campus · North Library",
      "Rockford · Bus Station",
      3,
      11,
      1,
      1000,
      "Mazda 3",
      "Going home for the weekend. Meet at the library entrance.",
    ],
    [
      "demo-6",
      "demo-you",
      "You",
      "Campus · Student Union",
      "Chicago · Downtown",
      4,
      13,
      2,
      1600,
      "Honda Accord",
      "A sample ride you are driving. Open Requests to try approving a rider.",
    ],
  ] as const;
  const snapshot: Snapshot = {
    user: { userId: "demo-you", displayName: "You" },
    profile: { displayName: "You", campus: "Example University" },
    isModerator: true,
    rides: entries.map(
      ([
        id,
        driverId,
        driverName,
        origin,
        destination,
        days,
        hour,
        seats,
        priceCents,
        car,
        notes,
      ]) => ({
        id,
        campus: "Example University",
        driverId,
        driverName,
        origin,
        destination,
        departure: departure(days, hour),
        seats,
        priceCents,
        car,
        notes,
        status: "active",
        createdAt: now,
        accepted: 0,
        version: 1,
      }),
    ),
    bookings: [
      {
        id: "demo-booking",
        rideId: "demo-6",
        riderId: "sam",
        riderName: "Sam Brooks",
        status: "pending",
        createdAt: now,
      },
    ],
  };
  snapshot.rides.push({
    id: "demo-appeal-ride",
    driverId: "demo-you",
    driverName: "You",
    origin: "Campus · North Library",
    campus: "Example University",
    destination: "Madison · Downtown",
    departure: departure(5, 11),
    seats: 2,
    priceCents: 1400,
    car: "Honda Accord",
    notes: "A fictional removed ride for trying the appeal process.",
    status: "removed",
    removalReportId: "demo-appeal-removal",
    createdAt: now,
    accepted: 0,
    version: 1,
  });
  return snapshot;
}

export function demoConversations(): Record<string, Message[]> {
  return {
    "demo-booking": [
      {
        id: "sample-message",
        bookingId: "demo-booking",
        senderId: "sam",
        senderName: "Sam Brooks",
        body: "Could we meet at the north entrance instead? This is a fictional demo message.",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
export function demoSafetyReports(): (Report & { isMine?: boolean })[] {
  return [
    {
      id: "sample-report",
      rideId: "demo-4",
      kind: "ride",
      reason: "Misleading listing",
      details:
        "This is a fictional report to demonstrate reviewing a concern. The pickup point and the driver’s note disagree.",
      status: "open",
      resolution: null,
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      origin: "Campus · West Residence",
      destination: "Chicago · Downtown",
      driverName: "Alex Rivera",
      isMine: false,
    },
    {
      id: "demo-appeal-removal",
      rideId: "demo-appeal-ride",
      kind: "ride",
      reason: "Misleading listing",
      details: "Fictional removal decision for demonstrating driver appeals.",
      status: "resolved",
      resolution: "hide",
      resolutionNotes: "Demo listing removed for review.",
      createdAt: new Date().toISOString(),
      origin: "Campus · North Library",
      destination: "Madison · Downtown",
      driverName: "You",
      rideStatus: "removed",
      isMine: false,
    },
  ];
}
