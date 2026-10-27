namespace :sanity do
  desc "Import a Sanity export (extracted directory or .ndjson file), e.g. sanity:import[db/import/production]"
  task :import, [:source] => :environment do |_task, args|
    abort "Usage: bin/rails \"sanity:import[path/to/export]\"" if args[:source].blank?

    result = SanityImport.new(args[:source]).run
    result.counts.each { |model, count| puts "#{model}: #{count}" }
    result.warnings.each { |warning| warn warning }
  end
end
