# Validates a document's `sections`: a list of known block types (the
# components in web/src/app/blocks/block-registry.ts).
module Sections
  extend ActiveSupport::Concern

  BLOCK_TYPES = %w[heroBlock richTextBlock imageBlock twoColumnBlock ctaBlock projectGridBlock postListBlock skillsBlock].freeze

  included do
    validate :sections_are_known_blocks
  end

  private

  def sections_are_known_blocks
    return errors.add(:sections, "must be a list") unless sections.is_a?(Array)

    unknown = sections.map { |section| section.is_a?(Hash) ? section["_type"] : section.class.name }.uniq - BLOCK_TYPES
    errors.add(:sections, "has unknown block types: #{unknown.join(', ')}") if unknown.any?
  end
end
