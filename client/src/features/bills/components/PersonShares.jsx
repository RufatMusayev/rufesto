import PersonCard from './PersonCard'

/** One card per person, the viewer's first (the server and the mapper both put them there). */
export default function PersonShares({ people, lang }) {
  return (
    <div className="bl-people">
      {people.map(p => <PersonCard key={p.userId} person={p} lang={lang} />)}
    </div>
  )
}
