import {
  autoMobileBookingJsonSchema,
  type AutoMobileSerivceBookingSlot,
} from "./booking";

const slots: AutoMobileSerivceBookingSlot[] = [
  {
    id: "1",
    name: "Slot 1",
  },
  {
    id: "2",
    name: "Slot 2",
  },
  {
    id: "3",
    name: "Slot 3",
  },
];

console.log(JSON.stringify(autoMobileBookingJsonSchema, null, 2));
