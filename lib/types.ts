export type Ride = {
  id: string;
  driverId: string;
  driverName: string;
  origin: string;
  destination: string;
  departure: string;
  seats: number;
  priceCents: number;
  car: string;
  notes: string;
  status: string;
  createdAt: string;
  accepted: number;
};
export type Booking = {
  id: string;
  rideId: string;
  riderId: string;
  riderName: string;
  status: string;
  createdAt: string;
};
export type User = { userId: string; displayName: string };
export type Message = {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};
export type Conversation = { messages: Message[]; canSend: boolean };
export type Snapshot = {
  rides: Ride[];
  bookings: Booking[];
  user: User | null;
};
