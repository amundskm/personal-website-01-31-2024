# A content document with a stable `uid` (referenced from JSON as `_ref`), a
# URL slug and drafts.
module Document
  extend ActiveSupport::Concern

  SLUG_FORMAT = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/

  included do
    include Draftable

    before_validation { self.uid ||= SecureRandom.uuid }
    validates :uid, presence: true, uniqueness: true
    validates :title, presence: true
    validates :slug, presence: true, uniqueness: true, format: { with: SLUG_FORMAT, message: "may only use lowercase letters, numbers and single dashes" }
    validate :slug_not_in_another_draft
  end

  private

  # Another document's unpublished edit may already claim this slug
  def slug_not_in_another_draft
    return if slug.blank?

    taken = self.class.where.not(id: id).where("draft->>'slug' = ?", slug).exists?
    errors.add(:slug, "is used by another draft") if taken
  end
end
