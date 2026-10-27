# Serves an image, cached forever. Without `w` it's the original file;
# otherwise a WebP for one usage at one of Image::WIDTHS:
#   /images/:id?crop=…&hotspot=…&s=…&w=800[&h=450]
# The site gets everything before `w` from the API (see Image#as_asset); `s`
# signs the usage's crop and hotspot. `h` must match one of
# Image::ASPECT_RATIOS and crops to it around the hotspot.
class ImagesController < ApplicationController
  rate_limit to: 600, within: 1.minute

  # Uploaded SVGs are served as-is; never let one run scripts
  after_action { response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox" }

  def show
    image = Image.find(params[:id])
    width = params[:w].presence&.to_i
    height = params[:h].presence&.to_i
    return serve(image.file.blob) if width.nil? || image.passthrough?

    crop = params[:crop].presence
    hotspot = params[:hotspot].presence
    unless Image.allowed_size?(width, height) && image.valid_signature?(crop, hotspot, params[:s])
      return render(json: { message: "Unsupported image size or parameters" }, status: :bad_request)
    end

    serve image.variant_for(
      width:, height:,
      crop: fractions(crop, %w[top bottom left right]),
      hotspot: fractions(hotspot, %w[x y]),
    ).processed
  end

  private

  # A blob or a processed variant: both respond to #download and #content_type
  def serve(file)
    expires_in 1.year, public: true
    send_data file.download, type: file.content_type, disposition: :inline
  end

  def fractions(value, keys)
    numbers = value.to_s.split(",").map { |n| Float(n, exception: false) }
    return nil unless numbers.length == keys.length && numbers.all? { |n| n&.between?(0, 1) }

    keys.zip(numbers).to_h
  end
end
