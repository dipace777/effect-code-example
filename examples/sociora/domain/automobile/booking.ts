import { Schema } from "effect";

export const AutoMobileSerivceBookingSlotSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

export type AutoMobileSerivceBookingSlot =
  typeof AutoMobileSerivceBookingSlotSchema.Type;

export const autoMobileBookingJsonSchema = Schema.toJsonSchemaDocument(
  AutoMobileSerivceBookingSlotSchema,
).schema;
