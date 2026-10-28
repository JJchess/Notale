"""Write and read back an OTIO using the official schema implementation."""
import json, sys, pathlib, math
import opentimelineio as otio

plan=json.load(open(sys.argv[1]))
rate=plan['rate']
def span(start,duration):
    return otio.opentime.TimeRange(otio.opentime.RationalTime(start,rate),otio.opentime.RationalTime(duration,rate))
timeline=otio.schema.Timeline(name=plan['title'],global_start_time=otio.opentime.RationalTime(0,rate))
timeline.metadata['notale']={'source':'film.json','baked':True,'frameRate':plan['frameRate']}
for spec in plan['tracks']:
    track=otio.schema.Track(name=spec['title'],kind=spec['kind'])
    cursor=0
    for c in spec['clips']:
        if c['at']>cursor:
            track.append(otio.schema.Gap(source_range=span(0,c['at']-cursor)))
        ref=otio.schema.ExternalReference(target_url=c['uri'],available_range=span(0,c['duration']))
        clip=otio.schema.Clip(name=c['title'],media_reference=ref,source_range=span(0,c['duration']))
        clip.metadata['notale']={'clipId':c['id'],'authored':c['authored']}
        track.append(clip)
        cursor=c['at']+c['duration']
    timeline.tracks.append(track)
otio.adapters.write_to_file(timeline,sys.argv[2])
restored=otio.adapters.read_from_file(sys.argv[2])
assert len(restored.tracks)==len(plan['tracks']), 'Track count differs'
root=pathlib.Path(sys.argv[2]).resolve().parent
for actual, spec in zip(restored.tracks, plan['tracks']):
    assert actual.name==spec['title'] and actual.kind==spec['kind'], 'Track order/kind differs'
    clips=list(actual.find_clips())
    assert len(clips)==len(spec['clips']), 'Clip count differs'
    for clip, expected in zip(clips,spec['clips']):
        span_in_parent=clip.range_in_parent()
        assert math.isclose(span_in_parent.start_time.rescaled_to(rate).value,expected['at'],abs_tol=1e-7), 'Clip position differs'
        assert math.isclose(span_in_parent.duration.rescaled_to(rate).value,expected['duration'],abs_tol=1e-7), 'Clip duration differs'
        assert math.isclose(clip.source_range.start_time.value,0,abs_tol=1e-7), 'Baked source start differs'
        assert math.isclose(clip.source_range.duration.rate,rate,abs_tol=1e-9), 'Clip rate differs'
        assert clip.media_reference.target_url==expected['uri'], 'Media reference differs'
        media=(root/expected['uri']).resolve()
        assert root in media.parents and media.is_file(), 'Missing or external media'
assert len(list(restored.find_clips()))==sum(len(t['clips']) for t in plan['tracks'])
print(json.dumps({'clips':len(list(restored.find_clips())),'duration':restored.duration().value,'rate':rate}))
