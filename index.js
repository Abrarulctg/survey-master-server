const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1qcsvas.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const surveyCollection = client.db('surveyMaster').collection('surveys');
        const userCollection = client.db('surveyMaster').collection('users');
        const paymentCollection = client.db('surveyMaster').collection('payments');
        const voteCollection = client.db('surveyMaster').collection('votes');


        //JWT releted api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
                expiresIn: "1h"
            });
            res.send({ token });
        })

        //Middlewares
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "unauthorized access" });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })

        }

        //use verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(401).send({ message: "forbidden access" });
            }
            next();
        }


        //============user releted api===============
        //get users data
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        //Post user to mongodb
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "User already exist!", insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        //getting user status is admin or not
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin });
        })

        //getting user status is Surveyor or not
        app.get('/users/surveyor/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let surveyor = false;
            if (user) {
                surveyor = user?.role === 'surveyor'
            }
            res.send({ surveyor });
        })

        //getting user status is pro-user or not
        app.get('/users/proUser/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let proUser = false;
            if (user) {
                proUser = user?.role === 'pro-user'
            }
            res.send({ proUser });
        })

        //update user role to surveyor
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role: 'surveyor' }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        //Update normal user role to pro-user from Admin dashboard
        app.patch('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: "pro-user" }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        //Delete a user by admin 
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        //==================Survey Releted api ==================
        // get all surveys from db
        app.get('/surveys', async (req, res) => {
            const result = await surveyCollection.find({ surveyStatus: 'publish' }).toArray();
            res.send(result);
        })
        //get survey by id
        app.get('/surveys/surveyDetails/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await surveyCollection.findOne(query);
            res.send(result);
        })


        //get survey by email
        app.get('/surveyor/surveys/:email', async (req, res) => {
            const email = req.params.email;
            const query = { createdBy: email };
            console.log(query)
            const result = await surveyCollection.find(query).toArray();
            console.log(result)
            res.send(result);
        })

        //Post a survey by surveyor
        app.post('/surveys', async (req, res) => {
            const survey = req.body;
            const surveyResult = await surveyCollection.insertOne(survey);
            console.log(surveyResult);
            res.send(surveyResult);
        })


        //Update survey by surveyor
        app.patch('/surveyor/update/:id', async (req, res) => {
            const updatedSurvey = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    title: updatedSurvey.title,
                    description: updatedSurvey.description,
                    surveyStatus: updatedSurvey.surveyStatus,
                    category: updatedSurvey.category,
                    deadline: updatedSurvey.deadline,
                    surveyStatus: updatedSurvey.surveyStatus,
                    updatedOn: updatedSurvey.updatedOn
                }
            }
            const result = await surveyCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        //Delete a survey by surveyor 
        app.delete('/surveys/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await surveyCollection.deleteOne(query);
            res.send(result);
        })



        // check if user has voted to this survey or not
        app.get('/vote/check/:surveyId/:userEmail', async (req, res) => {
            const { surveyId, userEmail } = req.params;
            const vote = await voteCollection.findOne({ surveyId, userEmail });
            if (vote) {
                res.send({ hasVoted: true });
            } else {
                res.send({ hasVoted: false });
            }
        })


        //Vote to a survey
        // app.post('/vote', verifyToken, async (req, res) => {
        //     const vote = req.body;
        //     const voteResult = await voteCollection.insertOne(vote);
        //     console.log(voteResult);
        //     res.send(voteResult);
        // })

        // Perform a Vote api
        app.post('/vote', verifyToken, async (req, res) => {
            const { surveyId, userEmail, vote } = req.body;
            const existingVote = await voteCollection.findOne({ surveyId, userEmail });
            if (existingVote) {
                res.status(401).send({ message: "You have already voted on this survey!" });
            } else {
                const voteResult = await voteCollection.insertOne(req.body);

                //update voteCout
                const updateCount = vote === 'yes' ? { yesOption: 1 } : { noOption: 1 };
                const updateResult = await surveyCollection.updateOne(
                    { _id: new ObjectId(surveyId) },
                    { $inc: updateCount }
                )
                console.log(voteResult);
                res.send({ voteResult, updateResult });
            }
        })









        //Payment integration======
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);  //as stripe calculate Poisha/Cent
            console.log("amount inside the intent", amount);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        //get payment details for user
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        //get all payment details for Admin
        app.get('/payments', verifyToken, async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            console.log(paymentResult);
            res.send(paymentResult);
        })


        //Update payment status from Admin dashboard
        app.patch('/payments/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: 'approved' }
            }
            const result = await paymentCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Survey Master is Running")
})
app.listen(port, (req, res) => {
    console.log(`Survey Master Server is running on Port: ${port}`)
})