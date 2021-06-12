var express = require('express');
var app = express();
var PORT = process.env.PORT || 3000;
var bodyParser = require("body-parser")
var Datastore = require('nedb')
var playerData = new Datastore({
    filename: 'playerData.db',
    autoload: true
})
var gameData = new Datastore({
    filename: 'gameData.db',
    autoload: true,
})
app.use(express.static('dist'));
app.use(bodyParser.urlencoded({ extended: true }));
const max_prob = 4
app.post('/first', function (req, response) {//to się dzieje po wejściu na adres jako pierwsze
    let time = req.body.time;
    let res;
    //Ten potwór poniżej odpowiada za sprawdzenie, czy na serwerze są gracze i czy są aktywni
    playerData.find({}, (err, docs) => {
        if (docs.length == 0) {//jeśli nie ma graczy to dołacza
            res = 1
            let doc = {
                time: time,//do sprawdzania aktywności
                player: 1,//jest dwóch graczy: 1 - wyzywający i 2 - zgadujący
                status: 'idle'//status gry, idle oznacza że czeka na rozpoczęcie gry
            }
            playerData.insert(doc, function (err, newDoc) { });
        } else if (docs.length == 1) {//jeśli jest już jeden gracz
            let doc;
            if (time - docs[0].time > 20000) {//jeśli jest nieaktywny, zostaje wyrzucony i dołącza jako gracz pierwszy
                playerData.remove({ _id: docs[0]._id }, { multi: true }, function (err, numRemoved) { });
                res = 1;
                doc = {
                    time: time,
                    player: 1,
                    status: 'idle'
                }
            } else {//jeśli gracz był aktywny to rozpoczyna grę
                res = 2;
                doc = {
                    time: time,
                    player: 2,
                    status: 'starting'//ten status oznacz, że czeka aż pierwszy gracz zadecyduje o kombinacji
                }
                let doc2 = {
                    time: docs[0].time,
                    player: docs[0].player,
                    status: 'starting'
                }
                playerData.update({ _id: docs[0]._id }, { $set: doc2 }, {}, function (err, numUpdated) { });
                gameData.remove({}, { multi: true }, function (err, numRemoved) { });
            }
            playerData.insert(doc, function (err, newDoc) { });
        } else if (time - docs[0].time > 20000 && time - docs[0].time > 20000) {//jeśli się toczy już gra sprawdza, czy są aktywni
            playerData.remove({ _id: docs[0]._id }, { multi: true }, function (err, numRemoved) { });//jeśli nie, to zostają wyrzuceni
            playerData.remove({ _id: docs[1]._id }, { multi: true }, function (err, numRemoved) { });
            res = 1
            let doc = {
                time: time,
                player: 1,
                status: 'idle'
            }
            playerData.insert(doc, function (err, newDoc) { });
        } else {//jeśli gra się aktywnie toczy, to odsyła, że gra jest w trakcie trwania
            res = 0;
        }
        //są trzy możliwe response w tym momencie:
        //1 - jest się graczem pierwszym
        //2 - jest się graczem drugim
        //0 - gra się obecnie toczy
        response.send(JSON.stringify({ status: res }));
    });
})

app.post('/check', function (req, res) {//to zapytanie jest w interwale, odpowiada upewnianie się, że gracze są aktywni
    playerData.find({}, (err, docs) => {//i przekazywanie im inforamcji o stanie rozgrywki
        let rec;
        if (docs[0].player == req.body.player) {
            rec = docs[0];
        } else {
            rec = docs[1];
        }
        let doc = {
            time: req.body.time,
            player: req.body.player,
            status: rec.status
        }
        gameData.find({ type: "guess" }, function (err, docs) {
            this.historia_meczy = docs.sort((a, b) => (a.time < b.time) ? 1 : ((b.time < a.time) ? -1 : 0))

        })
        playerData.update({ _id: rec._id }, { $set: doc }, {}, function (err, numUpdated) { });
        gameData.find({}, (err, docs2) => {
            /*console.log(this.historia_meczy)
            console.log(this.historia_meczy.length)
            if (this.historia_meczy.length > 0) {
                console.log(this.historia_meczy[0])
                console.log(this.historia_meczy[0].doskonale)
            }*/
            res.send(JSON.stringify({ playerData: docs, gameData: docs2, historia_meczy: this.historia_meczy, max_prob: max_prob }));
        })
    });
})

app.post('/color', function (req, res) {//to się dzieje, gdy wciśniesz enter będąc w kółku pośrodku ekranu, mając wybraną kombinację 4 kolorów
    let player = req.body.player;
    let colors = req.body.colors.split(',');
    if (player == 1) {//to odpowiada za to, jeśli gracz pierwszy decydujący o kombinacji wyśle swoją decyzję
        let doc = {
            type: 'start',
            combination: colors
        }
        gameData.insert(doc, function (err, newDoc) {
            playerData.find({}, (err, docs) => {
                playerData.update({ _id: docs[0]._id }, { $set: { time: docs[0].time, player: docs[0].player, status: 'ingame' } }, {}, function (err, numUpdated) { });
                playerData.update({ _id: docs[1]._id }, { $set: { time: docs[1].time, player: docs[1].player, status: 'ingame' } }, {}, function (err, numUpdated) { });
            });
        });
    } else {
        //console.log(colors, player)
        let proba = colors
        //sprawdzanie poprawnosci
        let doskonale = 0
        let blisko = 0
        gameData.find({ type: "start" }, function (err, docs) {
            this.kombinacja = docs[0].combination
            //sprawdzanie ilosci poprawnych kolorow
            for (let i = 0; i < proba.length; i++) {
                if (this.kombinacja.includes(proba[i])) {
                    if (this.kombinacja[i] == proba[i]) {
                        doskonale++
                    } else {
                        blisko++
                    }
                }
            }

            gameData.count({ type: "guess" }, function (err, count) {
                this.guess = count
                //console.log(this.guess)
                let doc = {
                    type: "guess",
                    time: this.guess + 1,
                    colors: colors,
                    blisko: blisko,
                    doskonale: doskonale
                }
                gameData.insert(doc)
                res.send(JSON.stringify(doc))
            })

        })




        /*
        Tutaj jest jedna z części twojej pracy, musisz zrobić mechanizm, który po przyjęciu zgadnięcia od zgadującego zapisuje je do kolekcji gameData
        proponowany format:
        {
            type: h + number - h odnosi się do historii zgadnięć, number odnosi się, który jest w kolejności;
            colors: tutaj wpisz po prostu - colors -
        }
        po więcej informacji o formacie przekazywanych informacji wpisz:
        console.log(player, colors)
        player to który gracz wysłał wiadomość
        colors to otrzymana kombinacja
        */
        //res.send(JSON.stringify({ proba: proba, doskonale: doskonale, blisko: blisko, ktora_proba: ktora_proba }));//pamiętaj, żeby zawsze na końcu odesłać jakąkolwiek informację

        //jeśli to jakieś ważne informacje to super, natomiast jeśli nie masz pomysłu co odesłać, wpisz po prostu to co wyżej
        //jeśli tego nie będzie, mogą być problemy z pracą na serwerze
    }
})
app.post('/finish', function (req, res) {

    playerData.find({}, (err, docs) => {//i przekazywanie im inforamcji o stanie rozgrywki
        //console.log(docs)
        playerData.remove({ player: req.body.player }, { multi: true }, function (err, numRemoved) { });
        playerData.count({}, function (err, count) {
            //console.log(count)
            if (count == 0) {
                gameData.find({}, (err, docs2) => {
                    for (let i = 0; i < docs2.length; i++) {
                        gameData.remove({}, function (err, numRemoved) { });
                    }
                });
            }
            res.send("ok")
        })
    });
})
app.listen(PORT, function () {
    console.log('start serwera na porcie ' + PORT);
});