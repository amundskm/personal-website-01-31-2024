# The image library: upload, and list for reuse.
class Admin::ImagesController < Admin::BaseController
  MAX_BYTES = 20.megabytes
  TYPES = %w[image/jpeg image/png image/webp image/gif image/avif image/svg+xml].freeze

  def index
    render json: Image.order(created_at: :desc).limit(200).map { |image| image_summary(image) }
  end

  def create
    file = params[:file]
    return render(json: { message: "Choose an image file" }, status: :bad_request) unless file.respond_to?(:tempfile)
    return render(json: { message: "Images can be up to 20 MB" }, status: :content_too_large) if file.size > MAX_BYTES

    # Trust the file's contents, not its name or the browser's claimed type
    type = Marcel::MimeType.for(file.tempfile, name: file.original_filename)
    return render(json: { message: "Unsupported image type" }, status: :unsupported_media_type) unless TYPES.include?(type)

    image = Image.create_from_file!(path: file.tempfile.path, filename: file.original_filename, content_type: type)
    render json: image_summary(image), status: :created
  rescue Vips::Error
    render json: { message: "That file couldn't be read as an image" }, status: :unprocessable_content
  end
end
