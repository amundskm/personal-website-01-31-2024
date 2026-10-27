# Verifies a Cognito *access* token (what the site sends as `Authorization:
# Bearer`) and returns its claims. Mirrors what API Gateway's JWT authorizer
# checks for the members API: signature, expiry, issuer and app client.
#
# Configured with COGNITO_USER_POOL_ID (e.g. "us-east-2_AbC123") and
# COGNITO_CLIENT_ID. Each environment (QA, production) has its own pool.
class CognitoToken
  class Invalid < StandardError; end

  JWKS_TTL = 6.hours

  def self.verify!(token)
    new(ENV.fetch("COGNITO_USER_POOL_ID", nil), ENV.fetch("COGNITO_CLIENT_ID", nil)).verify!(token)
  end

  def initialize(user_pool_id, client_id)
    raise Invalid, "Cognito is not configured" if user_pool_id.blank? || client_id.blank?

    @issuer = "https://cognito-idp.#{user_pool_id.split('_').first}.amazonaws.com/#{user_pool_id}"
    @client_id = client_id
  end

  def verify!(token)
    claims, = JWT.decode(token, nil, true, algorithms: ["RS256"], iss: @issuer, verify_iss: true, jwks: method(:jwks))
    raise Invalid, "Not an access token" unless claims["token_use"] == "access"
    raise Invalid, "Token is for another app" unless claims["client_id"] == @client_id

    claims
  rescue JWT::DecodeError => e
    raise Invalid, e.message
  end

  # Cognito's signing keys, cached; refetched when a token uses an unknown key.
  def jwks(options = {})
    cache_key = "cognito-jwks/#{@issuer}"
    Rails.cache.delete(cache_key) if options[:kid_not_found]
    Rails.cache.fetch(cache_key, expires_in: JWKS_TTL) do
      response = Net::HTTP.get_response(URI("#{@issuer}/.well-known/jwks.json"))
      raise Invalid, "Could not load Cognito keys (#{response.code})" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end
  end
end
