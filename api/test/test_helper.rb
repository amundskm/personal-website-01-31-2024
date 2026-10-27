ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    def import_sample_content
      SanityImport.new(file_fixture("sample-content.ndjson")).run
    end

    # A real image file, made with vips. Kept referenced so it isn't deleted mid-test.
    def png_file(width, height)
      file = Tempfile.new(["test", ".png"])
      (@tempfiles ||= []) << file
      Vips::Image.black(width, height, bands: 3).add([200, 100, 50]).cast(:uchar).write_to_file(file.path)
      file
    end
  end
end

# Signs Cognito-style access tokens with a test key, and makes CognitoToken
# trust that key instead of fetching Cognito's.
module CognitoTestHelper
  POOL_ID = "us-east-2_TestPool"
  CLIENT_ID = "test-client"
  KEY = OpenSSL::PKey::RSA.generate(2048)
  JWK = JWT::JWK.new(KEY, kid: "test-key")
  ORIGINAL_JWKS = CognitoToken.instance_method(:jwks)

  def setup
    super
    @cognito_env = ENV.to_h.slice("COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID")
    ENV["COGNITO_USER_POOL_ID"] = POOL_ID
    ENV["COGNITO_CLIENT_ID"] = CLIENT_ID
    CognitoToken.define_method(:jwks) { |_options = {}| { "keys" => [JWK.export] } }
  end

  def teardown
    ENV.delete("COGNITO_USER_POOL_ID")
    ENV.delete("COGNITO_CLIENT_ID")
    ENV.update(@cognito_env)
    CognitoToken.define_method(:jwks, ORIGINAL_JWKS)
    super
  end

  def access_token(groups: [], **overrides)
    claims = {
      "iss" => "https://cognito-idp.us-east-2.amazonaws.com/#{POOL_ID}",
      "token_use" => "access",
      "client_id" => CLIENT_ID,
      "sub" => "user-1",
      "exp" => 1.hour.from_now.to_i,
      "cognito:groups" => groups,
    }.merge(overrides.stringify_keys)
    JWT.encode(claims, KEY, "RS256", kid: JWK.kid)
  end

  def bearer(token) = { "Authorization" => "Bearer #{token}" }
end
