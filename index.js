const {
	ApolloServer,
	UserInputError,
	AuthenticationError,
	gql,
	PubSub
} = require("apollo-server");
const pubsub = new PubSub();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const config = require("./utils/config");
const Author = require("./models/author");
const Book = require("./models/book");
const User = require("./models/user");

mongoose.set("useFindAndModify", false);
mongoose.set("useCreateIndex", true);

console.log("Connecting to", config.MONGODB_URI);

mongoose
	.connect(config.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true
	})
	.then(() => {
		console.log("Connected to MongoDB");
	})
	.catch(error => {
		console.log("Error connection to MongoDB:", error.message);
	});

const typeDefs = gql`
	type Author {
		name: String!
		id: ID!
		born: Int
		bookCount: Int
	}

	type Book {
		title: String!
		published: Int!
		author: Author
		id: ID!
		genres: [String]!
	}

	type User {
		username: String!
		favoriteGenre: String
		id: ID!
	}

	type Token {
		value: String!
	}

	type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author]!
		me: User
	}

	type Mutation {
		addBook(
			title: String!
			published: Int!
			author: String!
			genres: [String]!
		): Book
		editAuthor(name: String!, setBornTo: Int): Author
		createUser(username: String!, favoriteGenre: String): User
		login(username: String!, password: String!): Token
	}

	type Subscription {
		bookAdded: Book!
	}
`;

const resolvers = {
	Author: {
		bookCount: async (root, args) => {
			const books = await Book.find({ author: { $eq: root.id } });
			return books.length;
		}
	},
	Query: {
		bookCount: () => {
			Book.collection.countDocuments();
		},
		authorCount: () => Author.collection.countDocuments(),
		allBooks: (root, args) => {
			return Book.find({}).populate("author");
		},
		allAuthors: async () => {
			return await Author.find({});
		},
		me: (root, args, { currentUser }) => {
			return currentUser;
		}
	},
	Mutation: {
		addBook: async (root, args, { currentUser }) => {
			if (!currentUser) {
				throw new AuthenticationError("Not authenticated");
			}

			if (args.title.length <= 3) {
				throw new UserInputError(
					"Title must be at least 3 characters",
					{
						invalidArgs: args.title
					}
				);
			}

			if (args.author.length <= 4) {
				throw new UserInputError(
					"Author name must be at least 4 characters",
					{
						invalidArgs: args.author
					}
				);
			}

			const bookExists = await Book.findOne({ title: args.title });

			if (bookExists) {
				throw new UserInputError("Title must be unique", {
					invalidArgs: args.title
				});
			}

			let author = await Author.findOne({ name: args.author });

			if (author === null) {
				author = new Author({ name: args.author });

				try {
					await author.save();
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args
					});
				}
			}

			const book = new Book({ ...args, author });

			try {
				await book.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				});
			}

			pubsub.publish("BOOK_ADDED", { bookAdded: book });

			return book;
		},
		editAuthor: async (roots, args, { currentUser }) => {
			if (!currentUser) {
				throw new AuthenticationError("Not authenticated");
			}

			const author = await Author.findOne({ name: args.name });
			author.born = args.setBornTo;

			try {
				await author.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				});
			}

			return author;
		},
		createUser: async (root, args) => {
			const user = new User({ username: args.username });

			try {
				await user.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				});
			}

			return user;
		},
		login: async (root, args) => {
			const user = await User.findOne({ username: args.username });

			if (!user || args.password !== "secret") {
				throw new UserInputError("Wrong credentials");
			}

			const userForToken = {
				username: user.username,
				id: user._id
			};

			return { value: jwt.sign(userForToken, process.env.SECRET) };
		}
	},
	Subscription: {
		bookAdded: {
			subscribe: () => pubsub.asyncIterator(["BOOK_ADDED"])
		}
	}
};

const server = new ApolloServer({
	typeDefs,
	resolvers,
	context: async ({ req }) => {
		const auth = req ? req.headers.authorization : null;
		if (auth && auth.toLowerCase().startsWith("bearer ")) {
			const decodedToken = jwt.verify(
				auth.substring(7),
				process.env.SECRET
			);
			const currentUser = await User.findById(decodedToken.id);
			return { currentUser };
		}
	}
});

server.listen().then(({ url, subscriptionsUrl }) => {
	console.log(`Server ready at ${url}`);
	console.log(`Subscriptions ready at ${subscriptionsUrl}`);
});
