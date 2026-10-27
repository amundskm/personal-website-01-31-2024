# A content document with a stable `uid` (referenced from JSON as `_ref`) and
# a URL slug.
module Document
  extend ActiveSupport::Concern

  SLUG_FORMAT = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/

  included do
    before_validation { self.uid ||= SecureRandom.uuid }
    validates :uid, presence: true, uniqueness: true
    validates :title, presence: true
    validates :slug, presence: true, uniqueness: true, format: { with: SLUG_FORMAT }
  end
end
