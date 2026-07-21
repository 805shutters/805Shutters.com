export type BookingAvailabilityResponse = {
  days?: Array<{
    date?: string;
    slots?: Array<{
      time?: string;
      available?: boolean;
    }>;
  }>;
};

export function customerBookableSlotKeys(responses: BookingAvailabilityResponse[]) {
  const keys = new Set<string>();

  responses.forEach((response) => {
    (response.days || []).forEach((day) => {
      if (!day.date) return;
      (day.slots || []).forEach((slot) => {
        if (slot.available && slot.time) keys.add(`${day.date} ${slot.time}`);
      });
    });
  });

  return keys;
}
