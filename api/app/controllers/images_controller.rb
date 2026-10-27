# Serves an image resized (and cropped for one usage) as WebP, cached forever:
#   /images/:id?w=800&h=450&crop=top,bottom,left,right&hotspot=x,y
# `crop` and `hotspot` are the fractions stored on the usage; `h` crops to that
# aspect ratio around the hotspot. Without parameters the original is served.
class ImagesController < ApplicationController
  rate_limit to: 600, within: 1.minute

  def show
    image = Image.find(params[:id])
    width = params[:w].to_i

    # Both respond to #download and #content_type
    file =
      if image.passthrough? || width <= 0
        image.file.blob
      else
        image.variant_for(
          width:,
          height: params[:h].presence&.to_i,
          crop: fractions(params[:crop], %w[top bottom left right]),
          hotspot: fractions(params[:hotspot], %w[x y]),
        ).processed
      end

    expires_in 1.year, public: true
    send_data file.download, type: file.content_type, disposition: :inline
  end

  private

  def fractions(value, keys)
    numbers = value.to_s.split(",").map { |n| Float(n, exception: false) }
    return nil unless numbers.length == keys.length && numbers.all? { |n| n&.between?(0, 1) }

    keys.zip(numbers).to_h
  end
end
