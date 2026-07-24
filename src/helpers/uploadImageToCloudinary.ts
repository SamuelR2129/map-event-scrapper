import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export const uploadImageToCloudinary = async (url: string, eventId: string) => {
  try {
    const folder = `map/events/${eventId}/eventBanner`;

    const result = await cloudinary.uploader.unsigned_upload(url, "scrapper_preset", {
      folder,
      public_id: `banner_${eventId}`,
    });

    return result.secure_url;
  } catch (err) {
    console.error(err);
    return;
  }
};
