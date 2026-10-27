# Converts a model to and from its editable document: the camelCase JSON the
# admin edits (and Sanity exported), with the slug as a plain string. Each
# model maps document keys to columns with `document_fields`.
module EditableDocument
  extend ActiveSupport::Concern

  class_methods do
    # { "documentKey" => :column }
    def document_fields(mapping = nil)
      return @document_fields unless mapping

      @document_fields = mapping.transform_keys(&:to_s).transform_values(&:to_s)
    end

    # Only known keys, with a `_key` on every object in an array (Portable
    # Text and the admin's list editors rely on them).
    def normalize_document(doc)
      doc.to_h.slice(*document_fields.keys).transform_values { |value| with_keys(value) }
    end

    def with_keys(value)
      case value
      when Array
        value.map do |item|
          item = with_keys(item)
          item.is_a?(Hash) && !item.key?("_key") ? { "_key" => SecureRandom.hex(6) }.merge(item) : item
        end
      when Hash then value.transform_values { |item| with_keys(item) }
      else value
      end
    end
  end

  def to_document
    self.class.document_fields.to_h do |key, column|
      value = self[column]
      [key, value.respond_to?(:iso8601) ? value.utc.iso8601(3) : value]
    end
  end

  # Sets the columns for the keys present in `doc`. Missing values in NOT NULL
  # columns (lists) fall back to the column default.
  def assign_document(doc)
    self.class.document_fields.each do |key, column|
      next unless doc.key?(key)

      value = doc[key]
      value = self.class.column_defaults[column] if value.nil? && !self.class.columns_hash[column].null
      self[column] = value
    end
    self
  end
end
