# Requires a valid Cognito access token and exposes the caller's groups.
module CognitoAuthentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_member!
    after_action { response.headers["Cache-Control"] = "private, no-store" }
  end

  private

  attr_reader :current_claims

  def authenticate_member!
    token = request.authorization&.delete_prefix("Bearer ")
    return render(json: { message: "Sign in required" }, status: :unauthorized) if token.blank?

    @current_claims = CognitoToken.verify!(token)
  rescue CognitoToken::Invalid => e
    Rails.logger.info("Rejected token: #{e.message}")
    render json: { message: "Sign in required" }, status: :unauthorized
  end

  def current_groups
    Array(current_claims["cognito:groups"])
  end

  def admin?
    current_groups.include?("admin")
  end

  def require_admin!
    render json: { message: "Forbidden" }, status: :forbidden unless admin?
  end
end
