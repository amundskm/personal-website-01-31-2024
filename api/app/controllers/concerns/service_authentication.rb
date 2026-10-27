# For server-to-server calls from the Amplify Lambdas, which send the shared
# SERVICE_TOKEN secret as a bearer token.
module ServiceAuthentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_service!
    after_action { response.headers["Cache-Control"] = "private, no-store" }
  end

  private

  def authenticate_service!
    expected = ENV.fetch("SERVICE_TOKEN", "")
    given = request.authorization&.delete_prefix("Bearer ").to_s
    return if expected.present? && ActiveSupport::SecurityUtils.secure_compare(given, expected)

    render json: { message: "Unauthorized" }, status: :unauthorized
  end
end
